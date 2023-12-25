import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { readFileSync } from 'fs';

export class CdkConfigdeployStack extends cdk.Stack {
  // Properties
  vpc: ec2.Vpc
  bationHostSecurityGroup: ec2.SecurityGroup

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

    //  Create key-pair for SSH
    const keyPairName = process.env.KEY_PAIR!
    const cfnKeyPair = new ec2.CfnKeyPair(this, keyPairName, {
      keyName: keyPairName,
      tags: [{
        key: 'sshKey',
        value: keyPairName,
      }],
    });

    const keyPair = ec2.KeyPair.fromKeyPairName(this, 'codedeploy-ssh-keypair', keyPairName)

    // Create bastion-host security group
    this.bationHostSecurityGroup = new ec2.SecurityGroup(this, 'public-host-sg', {
      vpc: this.vpc,
      securityGroupName: 'public-host-sg',
      allowAllOutbound: true,
    })

    this.bationHostSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow Internet to SSH to bastion host')

    // Create bastion host
    const machineImage = ec2.MachineImage.lookup({
      name: 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-20231207',
      owners: ['amazon'],
    });

    console.log("machineImage:", machineImage);
    const handle = new ec2.InitServiceRestartHandle();

    const instance = new ec2.Instance(this, 'bation-host', {
      vpc: this.vpc,
      instanceName: 'bation-host',
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImage: machineImage,
      availabilityZone: this.vpc.availabilityZones[0],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      keyName: keyPairName,
      // keyPair: props.keyPair, -> Bug: no KeyName in generated template
      securityGroup: this.bationHostSecurityGroup,
      userDataCausesReplacement: false,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['setupCfnHup',
            'installNprobe',
            'configNprobe',
            'testCfnHup'
          ],
        },
        configs: {
          setupCfnHup: new ec2.InitConfig([
            ec2.InitFile.fromString('/etc/cfn/cfn-hup.conf',
              `[main]
                 stack=${cdk.Stack.of(this).stackName}
                 region=${cdk.Stack.of(this).region}
                 interval=2
                 verbose=true
                `              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitFile.fromString('/etc/cfn/hooks.d/cfn-auto-reloader.conf',
  
              `[cfn-auto-reloader-hook]
                 triggers=post.update
                 path=Resources.Ec2Instance.Metadata.AWS::CloudFormation::Init
                 action=/opt/aws/bin/cfn-init -v
                 --stack ${cdk.Stack.of(this).stackName}
                 --resource Ec2Instance
                 --region ${cdk.Stack.of(this).region}
                 --configsets Update
                `
              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitService.enable('cfn-hup', {
              enabled: true,
              ensureRunning: true,
              serviceRestartHandle: handle
            })
          ]),
          installNprobe: new ec2.InitConfig([
            ec2.InitFile.fromFileInline('/tmp/nprobe-init.sh', './config/nprobe/nprobe-init.sh'),
            ec2.InitCommand.shellCommand('chmod + /tmp/nprobe-init.sh'),
            ec2.InitCommand.shellCommand('/tmp/nprobe-init.sh'),
            ec2.InitService.enable('nprobe', {
              enabled: true,
              ensureRunning: true,
              serviceRestartHandle: handle
            })
          ]),
          configNprobe: new ec2.InitConfig([
            ec2.InitFile.fromFileInline(
              '/etc/nprobe.conf',
              './config/nprobe/nprobe.conf',
              { serviceRestartHandles: [handle] }
            ),
  
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

    const cnfInit = ec2.CloudFormationInit.fromConfigSets({
      configSets: {
        default: ['setupCfnHup',
          'installNprobe',
          'configNprobe',
          'testCfnHup'
        ],
      },
      configs: {
        setupCfnHup: new ec2.InitConfig([
          ec2.InitFile.fromString('/etc/cfn/cfn-hup.conf',
            `[main]
               stack=${cdk.Stack.of(this).stackName}
               region=${cdk.Stack.of(this).region}
               interval=2
               verbose=true
              `              ,
            { serviceRestartHandles: [handle] }
          ),
          ec2.InitFile.fromString('/etc/cfn/hooks.d/cfn-auto-reloader.conf',

            `[cfn-auto-reloader-hook]
               triggers=post.update
               path=Resources.${instance.instance.logicalId}.Metadata.AWS::CloudFormation::Init
               action=/opt/aws/bin/cfn-init -v
               --stack ${cdk.Stack.of(this).stackName}
               --resource ${instance.instance.logicalId}
               --region ${cdk.Stack.of(this).region}
               --configsets Update
              `
            ,
            { serviceRestartHandles: [handle] }
          ),
          ec2.InitService.enable('cfn-hup', {
            enabled: true,
            ensureRunning: true,
            serviceRestartHandle: handle
          })
        ]),
        installNprobe: new ec2.InitConfig([
          ec2.InitFile.fromFileInline('/tmp/nprobe-init.sh', './config/nprobe/nprobe-init.sh'),
          ec2.InitCommand.shellCommand('chmod + /tmp/nprobe-init.sh'),
          ec2.InitCommand.shellCommand('/tmp/nprobe-init.sh'),
          ec2.InitService.enable('nprobe', {
            enabled: true,
            ensureRunning: true,
            serviceRestartHandle: handle
          })
        ]),
        configNprobe: new ec2.InitConfig([
          ec2.InitFile.fromFileInline(
            '/etc/nprobe.conf',
            './config/nprobe/nprobe.conf',
            { serviceRestartHandles: [handle] }
          ),

        ]),
        testCfnHup: new ec2.InitConfig([
          ec2.InitCommand.shellCommand('echo "+*+*+*+CFN-HUP+*+*+*+Working Well++++++"'),
        ]),
      },
    })



    console.log('Instance logical ID:', instance.instance.logicalId)
    
    // Workaround to overrid instance logical ID in CloudFormation Init
    // https://github.com/aws/aws-cdk/issues/14855
    const cfnHubReload = 
    `[cfn-auto-reloader-hook]
               triggers=post.update
               path=Resources.${instance.instance.logicalId}.Metadata.AWS::CloudFormation::Init
               action=/opt/aws/bin/cfn-init -v
               --stack ${cdk.Stack.of(this).stackName}
               --resource ${instance.instance.logicalId}
               --region ${cdk.Stack.of(this).region}
               --configsets Update
              `
    instance.instance.addOverride('Metadata.AWS::CloudFormation::Init.setupCfnHup.files./etc/cfn/hooks\\.d/cfn-auto-reloader\\.conf.content',
    cfnHubReload)          

    // cnfInit.attach(instance.instance, {
    //   instanceRole: instance.role,
    //   platform: ec2.OperatingSystemType.LINUX,
    //   userData: instance.userData,
    // })




    // 👇 load user data script
    const userDataScript = readFileSync('./config/base-init.sh', 'utf8');
    // Install neccessary tool
    instance.addUserData(userDataScript);
    // init Cloudformation helper
    // const cnfInitCommand = `
    // /usr/local/bin/cfn-init -v
    //   --stack ${cdk.Stack.of(this).stackName}
    //   --resource ${instance.instance.logicalId}
    //   --configsets default
    //   --region ${cdk.Stack.of(this).region}
    // `

    // const cnfSignalCommand = `
    // /usr/local/bin/cfn-signal -e $? 
    //   --stack ${cdk.Stack.of(this).stackName}
    //   --resource ${instance.instance.logicalId}
    //   --region ${cdk.Stack.of(this).region}
    // `
    // instance.userData.addCommands(cnfInitCommand)
    // instance.userData.addCommands(cnfSignalCommand)

    // Add the policy to access EC2 without SSH
    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    )

  }

}
