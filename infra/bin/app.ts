#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PicklePlayDatesStack } from '../lib/pickle-play-dates-stack';

const app = new cdk.App();

const env = app.node.tryGetContext('env') || 'dev';

new PicklePlayDatesStack(app, `PicklePlayDates-${env}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  environment: env,
});

app.synth(); 