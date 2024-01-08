import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { readFileAndSplitSync, createBaseCloudFormationInit } from './common'
export interface EC2InstanceExtProps extends ec2.InstanceProps {
    region: string
    setupSoftwares?: ec2.InitConfig
    updateConfigs?: ec2.InitConfig
}

export class EC2InstanceExt extends Construct {
    // Properties
    instance: ec2.Instance

    constructor(scope: Construct, id: string, props: EC2InstanceExtProps) {
        super(scope, id);
        // 👇 load user data script
        const commandsUserData = ec2.UserData.forLinux();
        commandsUserData.addCommands(`timedatectl set-timezone ${process.env.TIME_ZONE!}`);
        const initScript = readFileAndSplitSync('./config/base-init.sh').join('\n');
        commandsUserData.addCommands(initScript.replace(/HOST_NAME/g, id).replace(/PRIVATE_HOSTED_ZONE_NAME/g, process.env.PRIVATE_HOSTED_ZONE_NAME!));
        commandsUserData.addCommands('private_ip=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)');
        // commandsUserData.addCommands(`echo "$private_ip ${id}" >> /etc/hosts`);
        // Install codedeploy
        commandsUserData.addCommands(
            `echo "Install CodeDeploy agent"      
  apt install -y ruby-full
  cd /root
  wget https://aws-codedeploy-${cdk.Stack.of(this).region}.s3.${cdk.Stack.of(this).region}.amazonaws.com/latest/install
  chmod +x ./install
  ./install auto
  systemctl status codedeploy-agent
  `)

        //setup SNMP + Cloudwatch agent for all instances
        let updateConfigs = props.updateConfigs
        if (updateConfigs) {
            // Turn on instance terminal protection
            const terminalProtectionCommandContent =readFileAndSplitSync(`./config/modify-instance.sh`).join('\n')
            const terminalProtectionCommand = '/tmp/modify-instance.sh'
            updateConfigs.add(
                ec2.InitFile.fromString(terminalProtectionCommand, terminalProtectionCommandContent.replace(/REGION_ID/,cdk.Stack.of(this).region)))
            updateConfigs.add(ec2.InitCommand.shellCommand(`chmod +x ${terminalProtectionCommand}`))    
            updateConfigs.add(ec2.InitCommand.shellCommand(`${terminalProtectionCommand}`))

            const snmpdConf = readFileAndSplitSync(`./config/snmpd.conf`).join('\n')
            const cwAgentConf = readFileAndSplitSync(`./config/file_amazon-cloudwatch-agent.json`).join('\n')

            // SNMP
            updateConfigs.add(
                ec2.InitFile.fromString('/etc/snmp/snmpd.conf', snmpdConf))
            updateConfigs.add(ec2.InitCommand.shellCommand('systemctl restart snmpd'))

            // CWAgent
            updateConfigs.add(
                ec2.InitFile.fromString('/tmp/file_amazon-cloudwatch-agent.json', cwAgentConf))
            updateConfigs.add(ec2.InitCommand.shellCommand('/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -s -m ec2 -c file:/tmp/file_amazon-cloudwatch-agent.json'))
        }
        
        const cfnInit = createBaseCloudFormationInit({
            stackName: cdk.Stack.of(this).stackName,
            region: props.region,
            setupSoftwares: props.setupSoftwares,
            updateConfigs: updateConfigs

        })

        this.instance = new ec2.Instance(this, id, {
            ...props,
            userData: commandsUserData,
            userDataCausesReplacement: false,
            init: cfnInit,
            initOptions: {
                configSets: ['default', 'Update'],
                timeout: cdk.Duration.minutes(15),
            },
        });

        // Apply RemovalPolicy
        this.instance.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

        // Workaround to override instance logical ID in CloudFormation Init
        // https://github.com/aws/aws-cdk/issues/14855
        const cfnHubReload =
            `[cfn-auto-reloader-hook]
triggers=post.update
path=Resources.${this.instance.instance.logicalId}.Metadata.AWS::CloudFormation::Init
action=/usr/local/bin/cfn-init -v --stack ${cdk.Stack.of(this).stackName} --resource ${this.instance.instance.logicalId} --region ${cdk.Stack.of(this).region}  --configsets Update
`
        this.instance.instance.addOverride('Metadata.AWS::CloudFormation::Init.setupCfnHup.files./etc/cfn/hooks\\.d/cfn-auto-reloader\\.conf.content',
            cfnHubReload)

        // Add the policy to access EC2 without SSH
        this.instance.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
        )
        // Add the policy to access CodeDeploy
        this.instance.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2RoleforAWSCodeDeploy")
        );

        // Attach the CloudWatchAgentServerPolicy managed policy
        this.instance.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
        );

        // Allow to modifify instance attribute
        const instanceArn = cdk.Stack.of(this).formatArn(
            {
            service:"ec2",
            resource:"instance",
            resourceName:this.instance.instanceId,
            arnFormat:cdk.ArnFormat.SLASH_RESOURCE_NAME,
            }
          )
        const policy = new iam.PolicyStatement({
            actions: ['ec2:ModifyInstanceAttribute'],
            resources: [instanceArn] 
        });
        
        this.instance.role.attachInlinePolicy(new iam.Policy(this, 'ModifyInstancePolicy', {
            policyName: 'ModifyInstancePolicy',
            statements: [policy]
        }));


    }

}