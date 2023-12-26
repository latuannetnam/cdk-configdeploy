# Start basic installation
# Fix time zone
systemctl enable systemd-timedated
systemctl start systemd-timedated
timedatectl set-ntp true
# Update packages and install basic tools
apt-get update -y
apt-get -y install  mc htop wget curl net-tools nload nano git
# Install AWS CLI
apt install -y awscli
# Install CloudFormation helper script
apt-get -y install python3-pip
pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
mkdir -p /opt/aws/
ln -s /usr/local/bin /opt/aws/bin
# ln -s /usr/local/init/ubuntu/cfn-hup /etc/init.d/cfn-hup
