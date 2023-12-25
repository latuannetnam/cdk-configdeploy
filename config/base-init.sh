# Start basic installation
apt-get update -y
apt-get install -y mc htop wget curl net-tools nload nano git
# Install AWS CLI
apt install -y awscli
# Install CloudFormation helper script
apt-get -y install python3-pip
mkdir -p /opt/aws/
pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
ln -s /usr/local/init/ubuntu/cfn-hup /etc/init.d/cfn-hup
