#!/bin/bash

COLORINFO=4
TOOL=unsquashfs # squashfs-tools
ROOTFS=squashfs-root

if [ -z "$1" ]
then
	echo "extract squashfs to $ROOTFS"
	echo "usage: $0 src.fs"
	exit 1
fi

FNAME=$1

echo "processing $FNAME ..."

# extract root
if [ -e "$ROOTFS" ]
then
	echo "WARNING: $ROOTFS exists, skipping."
else
	echo 'extracting...'
	echo '------>>>'
	tput setaf $COLORINFO
	$TOOL -d $ROOTFS $FNAME '/!(dev)'
	RET=$?
	tput sgr0
	echo '<<<------'

	if [ $RET != 0 ] || [ ! -d "$ROOTFS" ]
	then
		echo 'ERROR: extract squashfs root failed'
		exit 1
	fi

	echo 'creating .gitkeep ...'
	find $ROOTFS -empty -type d -exec touch {}/.gitkeep \;

	./permssave.sh
	RET=$?
	if [ $RET != 0 ]
	then
		exit 1
	fi

	echo '/ done.'
fi

# extract dev
if [ -e "$ROOTFS-dev" ]
then
	echo "ERROR: $ROOTFS-dev exists, remove it."
elif [ -e "$ROOTFS/dev" ]
then
	echo "WARNING: $ROOTFS/dev exists, skipping."
else
	SUDO=
	if [ 'root' != "`whoami`" ]
	then
		SUDO='sudo'
	fi

	echo 'extracting /dev ...'
	echo '------>>>'
	tput setaf $COLORINFO
	$SUDO $TOOL -d $ROOTFS-dev $FNAME '/dev'
	RET=$?
	tput sgr0
	echo '<<<------'

	if [ $RET != 0 ] || [ ! -d $ROOTFS-dev/dev ]
	then
		echo 'ERROR: extract squashfs dev failed'
		exit 1
	fi

	$SUDO mv $ROOTFS-dev/dev $ROOTFS/dev
	$SUDO rmdir $ROOTFS-dev
	if [ ! -d "$ROOTFS/dev" ]
	then
		echo 'ERROR: move /dev failed'
		exit 1
	fi

	echo '/dev done.'
fi

exit 0

