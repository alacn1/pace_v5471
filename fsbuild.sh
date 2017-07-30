#!/bin/bash

COLORINFO=4
TOOL=mksquashfs # squashfs-tools
ROOTFS=squashfs-root

if [ -z "$1" ]
then
	echo "build squashfs from $ROOTFS"
	echo "usage: $0 out.fs"
	exit 1
fi
FNAME=$1


if [ ! -e "$ROOTFS" ]
then
	echo "ERROR: $ROOTFS doesn't exist"
	exit 1
fi
if [ ! -e "$ROOTFS/dev" ]
then
	echo "ERROR: $ROOTFS/dev doesn't exist"
	exit 1
fi


if [ -e "$FNAME" ]
then
	#echo "ERROR: $FNAME already exist"
	#exit 1
	echo "WARNING: removing $FNAME"
	rm -f $FNAME
fi

./permsrestore.sh
RET=$?
if [ $RET != 0 ]
then
	exit 1
fi

echo "building $FNAME ..."
echo '------>>>'
tput setaf $COLORINFO
$TOOL $ROOTFS $FNAME -comp lzma -b 65536 -all-root -ef <( find $ROOTFS -name .gitkeep | sed "s@^$ROOTFS/@@" )
RET=$?
tput sgr0
echo '<<<------'

if [ $RET != 0 ]
then
	echo "ERROR: build squashfs failed"
	exit 1
fi

echo "$FNAME done."
exit 0

