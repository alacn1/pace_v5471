#!/bin/bash

if [ -z "$1" ]
then
	echo "usage: $0 firmware"
	exit 1
fi

FNAME=$1

if [ ! -f "$FNAME" ]
then
	echo "ERROR: $FNAME doesn't exist"
	exit 1
fi

curl -H "Expect:" "http://192.168.25.1/cgi-bin/firmware.cgi" -F sFirmwareFile=@$FNAME

