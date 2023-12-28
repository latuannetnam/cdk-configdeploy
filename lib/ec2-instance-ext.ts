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
        commandsUserData.addCommands(readFileAndSplitSync('./config/base-init.sh').join('\n'));
        const cfnInit = createBaseCloudFormationInit({
            stackName: cdk.Stack.of(this).stackName,
            region: props.region,
            setupSoftwares: props.setupSoftwares,
            updateConfigs:props.updateConfigs

        })

        this.instance = new ec2.Instance(this, id, {
            ...props,
            userData: commandsUserData,
            init: cfnInit,
            initOptions: {
                configSets: ['default', 'Update'],
                timeout: cdk.Duration.minutes(15),
            },
        });

        // Workaround to overrid instance logical ID in CloudFormation Init
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
    }

}