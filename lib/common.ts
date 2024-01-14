import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import * as fs from 'fs';
export interface IPPrefix {
    prefix: string;
}

export interface BaseResourcesProps extends cdk.NestedStackProps {
    region: string
    vpc: ec2.Vpc
    machineImage: ec2.IMachineImage
    keyPair: ec2.IKeyPair
}    


  export function readIPPrefixesFromFile(filePath: string): IPPrefix[] {
    try {
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContents.split('\n');
  
      const ipPrefixes: IPPrefix[] = [];
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          // Validate IP prefix format (replace with a more robust validation if needed)
          if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(trimmedLine)) {
            ipPrefixes.push({ prefix: trimmedLine });
          } else {
            console.warn(`Invalid IP prefix format: ${trimmedLine}`);
          }
        }
      }
  
      return ipPrefixes;
    } catch (error) {
      console.error(`Error reading IP prefixes from file: ${(error as any).message}`);
      throw error;
    }
  }
  

  export interface CloudFormationInitProps {
    stackName: string
    region: string
    setupSoftwares?: ec2.InitConfig
    updateConfigs?: ec2.InitConfig
}
export function readFileAndSplitSync(filePath: string): string[] {
    const fileContents = readFileSync(filePath, 'utf-8');
    const lines = fileContents.split(/\r?\n/);
    return lines;
  }

export function  getSortedFilesInDirectory(directory: string): string[] {
    // Synchronously read the directory
    let files = readdirSync(directory);

    // Filter out directories and sort the files
    files = files.filter(file => {
      return statSync(path.join(directory, file)).isFile();
    }).sort();

    return files;
  }

export function createBaseCloudFormationInit(props: CloudFormationInitProps): ec2.CloudFormationInit {
    const handle = new ec2.InitServiceRestartHandle();
    const setupSoftwares = props.setupSoftwares || new ec2.InitConfig([]) ;
    const updateConfigs = props.updateConfigs || new ec2.InitConfig([]) ;
    const cfnInit = ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['setupCfnHup',
          ],
          setupSoftwares: [
            'setupSoftwares',
            'testCfnHup'
          ],
          UpdateConfigs: [
            'updateConfigs',
            'testCfnHup'
          ]
        },
        configs: {
          setupCfnHup: new ec2.InitConfig([
            ec2.InitFile.fromString('/etc/cfn/cfn-hup.conf',
              `[main]
  stack=${props.stackName}
  region=${props.region}
  interval=1
  verbose=true
  `              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitFile.fromString('/etc/cfn/hooks.d/cfn-setup-softwares.conf',
  
              ` Content will be updated later
                `
              ,
              { serviceRestartHandles: [handle] }
            ),
            ec2.InitFile.fromString('/etc/cfn/hooks.d/cfn-update-configs.conf',
  
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
              serviceRestartHandle: handle,
            }),
          ]),
          // Install software
          setupSoftwares: setupSoftwares,
          // update software Configuration
          updateConfigs: updateConfigs,
          testCfnHup: new ec2.InitConfig([
            ec2.InitCommand.shellCommand('echo "+*+*+*+CFN-HUP+*+*+*+Working Well++++++"'),
          ]),
        },
      })
    
    return cfnInit  
}  