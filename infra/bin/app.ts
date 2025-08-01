#!/usr/bin/env node
import 'source-map-support/register';
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { PicklePlayDatesStack } from '../lib/pickle-play-dates-stack';

// Load environment variables from .env file
dotenv.config();

const app = new cdk.App();

const env = app.node.tryGetContext('env') || 'dev';

new PicklePlayDatesStack(app, `PicklePlayDates-${env}`, {
  environment: env,
});

app.synth(); 