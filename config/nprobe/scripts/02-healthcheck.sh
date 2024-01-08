# Healthcheck script to check status of Nprobe: OK & connected to Ntop
# Install apache2
apt-get install -y apache2
systemctl enable apache2
a2enmod cgid
systemctl restart apache2

# Output the content of the provided Bash script
cat > /usr/lib/cgi-bin/healthcheck.cgi <<EOT
#!/bin/bash

# Check nprobe service status
if systemctl is-active --quiet nprobe; then
    nprobe_status="active"
else
    nprobe_status="inactive"
    printf "Status: 400\r\n"
    printf "\r\n"
    exit 1  # Return a 400 Bad Request error code
fi

# Check port NTOP_ZMQ_PORT/TCP status
if ss -tpn | grep -q ':NTOP_ZMQ_PORT'; then
    port_status="connected"
else
    port_status="not connected"
    printf "Status: 503\r\n"
    printf "\r\n"
    exit 1  # Return a 503 Service Unavailable error code
fi

# If both conditions are met, print output and return 200 OK
cat <<EOF
Content-type: text/plain

nprobe service is active and connected on port NTOP_ZMQ_PORT/TCP.
EOF
exit 0  # Return a 200 OK status code
EOT

#chmod healthcheck.cgi
chmod 755 /usr/lib/cgi-bin/healthcheck.cgi