# Install Nprobe
# Install Nprobe
apt-get install -y software-properties-common wget
add-apt-repository universe
cd /root
echo "Test ..."
echo $HOME
echo ~/
# mkdir -p ~/.gnupg
echo "End Test"
# mkdir -p /root/.gnupg
# wget https://packages.ntop.org/apt-stable/22.04/all/apt-ntop-stable.deb
# apt-get install -y ./apt-ntop-stable.deb
apt-get update -y
apt-get install -y pfring-dkms nprobe
