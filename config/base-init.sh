echo "Starting basic installation"
# Enable time sync
# systemctl enable systemd-timedated
systemctl start systemd-timedated
timedatectl set-ntp true

echo  "Update packages and install basic tools"
apt-get update -y
apt-get install -y apt-transport-https ca-certificates dirmngr 
apt-get -y install  mc htop wget curl net-tools nload nano git
apt-get -y install snmp snmpd snmp-mibs-downloader libnet-snmp-perl snmptrapd
systemctl enable snmpd

echo "Installing AWS CLI"
apt install -y awscli

echo "Install CloudFormation helper script"
apt-get -y install python3-pip
pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
mkdir -p /opt/aws/
ln -s /usr/local/bin /opt/aws/bin

echo "Install CloudWatch Agent"
cd /root
wget https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb

sed -i 's/preserve_hostname: false/preserve_hostname: true/' /etc/cloud/cloud.cfg
hostnamectl hostname HOST_NAME.PRIVATE_HOSTED_ZONE_NAME

echo "Done!"