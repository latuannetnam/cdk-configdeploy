# Install Nprobe
apt-get install -y software-properties-common wget
add-apt-repository universe
apt-get update -y
apt-get install -y pfring-dkms nprobe
systemctl enable nprobe.service
systemctl restart nprobe.service
