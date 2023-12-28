# Init for bation-host
yum -y update 
# Install tools
yum -y install  mc htop wget curl net-tools nload nano git unzip
# Install AWS CLI
yum install awscli -y
aws --version
