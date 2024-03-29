#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as region_info from '@aws-cdk/region-info';
import { CdkConfigdeployStack } from '../lib/cdk-configdeploy-stack';

import * as dotenv from 'dotenv';

const app = new cdk.App();
// Load variable from .env file
const profile = app.node.tryGetContext('env_id');
dotenv.config({ path: profile ? `.env.${profile}` : undefined });
// const regionInfo = region_info.RegionInfo.get('name');

// console.log('Region Info:', regionInfo);
console.log('Account:', process.env.CDK_DEFAULT_ACCOUNT);
console.log('Region', process.env.CDK_DEFAULT_REGION);
new CdkConfigdeployStack(app, process.env.STACK_NAME!, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  terminationProtection: true,

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});