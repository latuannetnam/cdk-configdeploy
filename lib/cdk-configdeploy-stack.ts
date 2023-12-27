import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as path from 'path';
import { readFileSync } from 'fs';

export class CdkConfigdeployStack extends cdk.Stack {
  // Properties
  vpc: ec2.Vpc
  bationHostSecurityGroup: ec2.SecurityGroup
  keyPairName: string
  machineImage: ec2.IMachineImage

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Create VPC
    this.vpc = new ec2.Vpc(this, 'monitoring-vpc', {
      ipAddresses: ec2.IpAddresses.cidr(process.env.VPC_CIDR!),
      natGateways: 0,
      maxAzs: parseInt(process.env.MAX_AZS!),
      enableDnsHostnames: true,
      enableDnsSupport: true,
      restrictDefaultSecurityGroup: false,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    })

    this.keyPairName = process.env.KEY_PAIR!
    const cfnKeyPair = new ec2.CfnKeyPair(this, this.keyPairName, {
      keyName: this.keyPairName,
      tags: [{
        key: 'sshKey',
        value: this.keyPairName,
      }],
    });
    //  Create key-pair for SSH
    const keyPair = ec2.KeyPair.fromKeyPairName(this, 'codedeploy-ssh-keypair', this.keyPairName)

    // Create bastion-host security group
    this.bationHostSecurityGroup = new ec2.SecurityGroup(this, 'public-host-sg', {
      vpc: this.vpc,
      securityGroupName: 'public-host-sg',
      allowAllOutbound: true,
    })

    this.bationHostSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow Internet to SSH to bastion host')

    this.machineImage = ec2.MachineImage.lookup({
      name: 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-20231207',
      owners: ['amazon'],
    });

    console.log("machineImage:", this.machineImage);

    this.createInstanceSimple(props)
    // this.createInstance(props)

  }

  readFileAndSplitSync(filePath: string): string[] {
    const fileContents = readFileSync(filePath, 'utf-8');
    const lines = fileContents.split(/\r?\n/);
    return lines;
  }

  createInstanceSimple(props?: cdk.StackProps) {

    // Create bastion host
    const handle = new ec2.InitServiceRestartHandle();
    // 👇 load user data script
    const commandsUserData = ec2.UserData.forLinux();
    commandsUserData.addCommands(`timedatectl set-timezone ${process.env.TIME_ZONE!}`);
    commandsUserData.addCommands(this.readFileAndSplitSync('./config/base-init.sh').join('\n'));
    const instance = new ec2.Instance(this, 'bation-host-simple', {
      vpc: this.vpc,
      instanceName: 'bation-host-simple',
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImage: this.machineImage,
      availabilityZone: this.vpc.availabilityZones[0],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      keyName: this.keyPairName,
      // keyPair: props.keyPair, -> Bug: no KeyName in generated template
      securityGroup: this.bationHostSecurityGroup,
      userData: commandsUserData,
      userDataCausesReplacement: false,
    })

    // Add tags to instance
    cdk.Tags.of(instance).add('group', 'bation-host')
    


    console.log('Instance logical ID:', instance.instance.logicalId)

    // Add the policy to access EC2 without SSH
    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    )

  }

  createInstance(props?: cdk.StackProps) {

    // Create bastion host
    const handle = new ec2.InitServiceRestartHandle();
    // 👇 load user data script
    const commandsUserData = ec2.UserData.forLinux();
    commandsUserData.addCommands(`timedatectl set-timezone ${process.env.TIME_ZONE!}`);
    commandsUserData.addCommands(this.readFileAndSplitSync('./config/base-init.sh').join('\n'));
    const instance = new ec2.Instance(this, 'bation-host', {
      vpc: this.vpc,
      instanceName: 'bation-host',
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImage: this.machineImage,
      availabilityZone: this.vpc.availabilityZones[0],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      keyName: this.keyPairName,
      // keyPair: props.keyPair, -> Bug: no KeyName in generated template
      securityGroup: this.bationHostSecurityGroup,
      userData: commandsUserData,
      userDataCausesReplacement: false,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['setupCfnHup',
          ],
          Update: [
            'updateConfig',
            'testCfnHup'
          ]
        },
        configs: {
          setupCfnHup: new ec2.InitConfig([
            ec2.InitFile.fromString('/etc/cfn/cfn-hup.conf',
              `[main]
stack=${cdk.Stack.of(this).stackName}
region=${cdk.Stack.of(this).region}
interval=1
verbose=true
`              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitFile.fromString('/etc/cfn/hooks.d/cfn-auto-reloader.conf',

              ` Content will be updated later
                `
              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitService.systemdConfigFile('cfn-hup', {
              command: '/usr/local/bin/cfn-hup',
              description: 'cfn-hup daemon'

            }),
            // Start the server using SystemD
            ec2.InitService.enable('cfn-hup', {
              serviceManager: ec2.ServiceManager.SYSTEMD,
            }),
          ]),
          updateConfig: new ec2.InitConfig([
            ec2.InitCommand.shellCommand('echo Hello world')
          ]),
          testCfnHup: new ec2.InitConfig([
            ec2.InitCommand.shellCommand('echo "+*+*+*+CFN-HUP+*+*+*+Working Well++++++"'),
          ]),
        },
      }),
      initOptions: {
        configSets: ['default'],
        timeout: cdk.Duration.minutes(5),
      },
    })


    console.log('Instance logical ID:', instance.instance.logicalId)

    // Workaround to overrid instance logical ID in CloudFormation Init
    // https://github.com/aws/aws-cdk/issues/14855
    const cfnHubReload =
      `[cfn-auto-reloader-hook]
 triggers=post.update
 path=Resources.${instance.instance.logicalId}.Metadata.AWS::CloudFormation::Init
 action=/usr/local/bin/cfn-init -v --stack ${cdk.Stack.of(this).stackName} --resource ${instance.instance.logicalId} --region ${cdk.Stack.of(this).region}  --configsets Update
`
    instance.instance.addOverride('Metadata.AWS::CloudFormation::Init.setupCfnHup.files./etc/cfn/hooks\\.d/cfn-auto-reloader\\.conf.content',
      cfnHubReload)

    // Add the policy to access EC2 without SSH
    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    )

  }

  createInstance2(props?: cdk.StackProps) {

    // Create bastion host
    const handle = new ec2.InitServiceRestartHandle();
    // 👇 load user data script
    const commandsUserData = ec2.UserData.forLinux();
    commandsUserData.addCommands(`timedatectl set-timezone ${process.env.TIME_ZONE!}`);
    commandsUserData.addCommands(this.readFileAndSplitSync('./config/base-init.sh').join('\n'));
    commandsUserData.addCommands(this.readFileAndSplitSync('./config/nprobe/ntop-preinstall.sh').join('\n'));
    commandsUserData.addCommands(this.readFileAndSplitSync('./config/nprobe/nprobe-init.sh').join('\n'));

    const instance = new ec2.Instance(this, 'bation-host2', {
      vpc: this.vpc,
      instanceName: 'bation-host2',
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImage: this.machineImage,
      availabilityZone: this.vpc.availabilityZones[0],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      keyName: this.keyPairName,
      // keyPair: props.keyPair, -> Bug: no KeyName in generated template
      securityGroup: this.bationHostSecurityGroup,
      userData: commandsUserData,
      userDataCausesReplacement: false,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['setupCfnHup',
            // 'installNprobe',
            'configNprobe',
            'restartNprobe'
          ],
          Update: [
            'configNprobe',
            'restartNprobe',
            'testCfnHup'
          ]
        },
        configs: {
          setupCfnHup: new ec2.InitConfig([
            ec2.InitFile.fromString('/etc/cfn/cfn-hup.conf',
              `[main]
stack=${cdk.Stack.of(this).stackName}
region=${cdk.Stack.of(this).region}
interval=1
verbose=true
`              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitFile.fromString('/etc/cfn/hooks.d/cfn-auto-reloader.conf',

              ` Content will be updated later
                `
              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitFile.fromString('/etc/systemd/system/cfn-hup.service',
              `[Unit]
Description=cfn-hup daemon
[Service]
Type=simple
ExecStart=/usr/local/bin/cfn-hup
Restart=always
[Install]
WantedBy=multi-user.target`,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitCommand.shellCommand('systemctl enable cfn-hup.service'),
            ec2.InitCommand.shellCommand('systemctl start cfn-hup.service')
          ]),
          installNprobe: new ec2.InitConfig([
            ec2.InitCommand.shellCommand('echo $HOME'),
            ec2.InitCommand.shellCommand('echo ~/'),
            ec2.InitFile.fromString('/tmp/nprobe-init.sh', this.readFileAndSplitSync('./config/nprobe/nprobe-init.sh').join('\n')),
            ec2.InitCommand.shellCommand('chmod +x /tmp/nprobe-init.sh'),
            ec2.InitCommand.shellCommand('/tmp/nprobe-init.sh', { cwd: '/tmp' }),
          ]),
          configNprobe: new ec2.InitConfig([
            ec2.InitFile.fromString(
              '/etc/nprobe/nprobe.conf',
              this.readFileAndSplitSync('./config/nprobe/nprobe.conf').join('\n')
            ),

          ]),
          restartNprobe: new ec2.InitConfig([
            ec2.InitCommand.shellCommand('systemctl enable nprobe.service'),
            ec2.InitCommand.shellCommand('systemctl restart nprobe.service')
          ]),
          testCfnHup: new ec2.InitConfig([
            ec2.InitCommand.shellCommand('echo "+*+*+*+CFN-HUP+*+*+*+Working Well++++++"'),
          ]),
        },
      }),
      initOptions: {
        configSets: ['default'],
        timeout: cdk.Duration.minutes(15),
      },
    })


    console.log('Instance logical ID:', instance.instance.logicalId)

    // Workaround to overrid instance logical ID in CloudFormation Init
    // https://github.com/aws/aws-cdk/issues/14855
    const cfnHubReload =
      `[cfn-auto-reloader-hook]
 triggers=post.update
 path=Resources.${instance.instance.logicalId}.Metadata.AWS::CloudFormation::Init
 action=/usr/local/bin/cfn-init -v --stack ${cdk.Stack.of(this).stackName} --resource ${instance.instance.logicalId} --region ${cdk.Stack.of(this).region}  --configsets Update
`
    instance.instance.addOverride('Metadata.AWS::CloudFormation::Init.setupCfnHup.files./etc/cfn/hooks\\.d/cfn-auto-reloader\\.conf.content',
      cfnHubReload)


    // Install neccessary tool
    // instance.addUserData(userDataScript);
    // Add the policy to access EC2 without SSH
    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    )
  }

  createCodeDeploy(props: cdk.StackProps) {

  }




}
