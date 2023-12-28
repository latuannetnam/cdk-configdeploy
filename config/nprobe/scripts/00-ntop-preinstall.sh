# Install Ntop Repository
SUB_DISTRO=`lsb_release -i|cut -f 2`
if test "$SUB_DISTRO" = "Debian"; then
  REL=`/usr/bin/lsb_release -c|cut -f 2`
else
  REL=`/usr/bin/lsb_release -s -r`
fi

MACHINE=`uname -m`
if test "$MACHINE" = "x86_64"; then
    EXTN="x64"
    MACHINE_DIR=
else
    if test "$MACHINE" = "aarch64"; then
        EXTN="arm64"
    else
        EXTN="armhf"
    fi

    REL=`lsb_release -c -s`"_pi"
fi
echo "deb [signed-by=/usr/share/keyrings/ntop-archive-keyring.gpg] https://packages.ntop.org/apt-stable/$REL/ $EXTN/" > /etc/apt/sources.list.d/ntop.list
echo "deb [signed-by=/usr/share/keyrings/ntop-archive-keyring.gpg] https://packages.ntop.org/apt-stable/$REL/ all/" >> /etc/apt/sources.list.d/ntop.list
#
if ! test -d  /root/.gnupg; then
    mkdir /root/.gnupg
    chown -R root:root /root/.gnupg
    chmod -R go-rwx /root/.gnupg
fi

# Export proxies
for protocol in http https
do
    eval "$(apt-config shell ${protocol}_proxy Acquire::$protocol::Proxy)"
    export "${protocol}_proxy"
done

if ${http_proxy+"false"}; then
    if ! ${https_proxy+"false"}; then
        PROXY=$https_proxy
    fi
else
    PROXY=$http_proxy
fi

if ${PROXY+"false"} || [ -z ${PROXY} ]; then
    echo "Installing ntop GPG key [no proxy]. Please wait..."
    gpg --no-default-keyring --keyring /usr/share/keyrings/ntop-archive-keyring.gpg --keyserver hkps://keyserver.ubuntu.com:443 --recv-keys 8E07231F05757F56FECE39773D84C955924F7599
else
    echo "Installing ntop GPG key [using proxy $PROXY]. Please wait..."
    gpg --keyserver-options http-proxy=$PROXY --no-default-keyring --keyring /usr/share/keyrings/ntop-archive-keyring.gpg --keyserver hkps://keyserver.ubuntu.com:443 --recv-keys 8E07231F05757F56FECE39773D84C955924F7599
fi
#