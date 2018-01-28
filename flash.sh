#!/bin/bash

FNAME=$1
ROUTERIP=$2
USERNAME=$3

if [ -z "$FNAME" ]
then
	echo "usage: $0 firmware.bin [routerip] [username]"
	exit 1
fi

if [ ! -f "$FNAME" ]
then
	echo "ERROR: $FNAME doesn't exist"
	exit 1
fi

if [ -z "$ROUTERIP" ]
then
	ROUTERIP='192.168.25.1'
fi

if [ ! -z "$USERNAME" ]
then
	USERNAME="--digest --user $USERNAME"
fi

curl -H "Expect:" "http://${ROUTERIP}/cgi-bin/firmware.cgi" -F sFirmwareFile=@"$FNAME" $USERNAME

