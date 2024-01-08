#!/usr/bin/bash
echo "Modify instance attribute"
instance_id=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
aws --region REGION_ID ec2  modify-instance-attribute --disable-api-termination --instance-id $instance_id