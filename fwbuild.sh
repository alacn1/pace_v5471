#!/bin/bash

COLORINFO=4
UPDATEFW=./updatefw
ROOTFS=squashfs-root
OUTDIR=build

if [ -z "$1" ] || [ -z "$2" ]
then
	echo "usage: $0 srcfw.bin outfw.bin"
	exit 1
fi
SRCFW=$1
OUTFW=$2

# sanity check
if [ ! -f "$SRCFW" ]
then
	echo "ERROR: $SRCFW doesn't exist"
	exit 1
fi
if [ ! -d "$ROOTFS" ]
then
	echo "ERROR: $ROOTFS is missing, extract it"
	exit 1
fi
if [ ! -x "$UPDATEFW" ]
then
	echo "ERROR: $UPDATEFW doesn't exist"
	exit 1
fi



OUTFILE=$OUTDIR/$OUTFW

# already exist?
if [ -e "$OUTFILE" ]
then
	echo "ERROR: $OUTFILE already exist"
	exit 1
	#echo "WARNING: removing $OUTFILE"
	#rm -f $OUTFILE
fi

if [ ! -d "$OUTDIR" ]
then
	mkdir -p $OUTDIR
fi

# build fs
FS=`dirname $OUTFILE`/`basename -s .bin $OUTFILE`.fs
./fsbuild.sh $FS
RET=$?
if [ $RET != 0 ]
then
	echo "ERROR: fs build failed"
	exit 1
fi

# build fw
echo "building $OUTFILE ..."
echo '------>>>'
tput setaf $COLORINFO
$UPDATEFW -u $SRCFW -s $FS -o $OUTFILE
RET=$?
tput sgr0
echo '<<<------'
if [ $RET != 0 ]
then
	echo "ERROR: fw build failed"
	exit 1
fi

#rm -f $FS

echo "$OUTFILE done."
exit 0

