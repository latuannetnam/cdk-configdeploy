apt-get install software-properties-common wget
add-apt-repository universe
wget https://packages.ntop.org/apt-stable/22.04/all/apt-ntop-stable.deb
apt install -y ./apt-ntop-stable.deb
apt-get update -y
apt-get install -y pfring-dkms nprobe
