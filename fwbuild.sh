#!/bin/bash

COLORINFO=4
UPDATEFW=./updatefw
ROOTFS=squashfs-root
OUTDIR=build

# save old version
OLDVERSION=`cat squashfs-root/etc/bewan/release`

# version from last tag v*
# strip v and -0
VERSION=`git describe --long --tags --match 'v*' | sed -r 's/^v(.+)$/\1/;s/^(.*)-0-(.*)$/\1-\2/'`

# params check
SRCFW=$1
OUTFW=$2
if [ -z "$OUTFW" ] && [ ! -z "$VERSION" ]
then
	OUTFW="$VERSION.bin"
fi
if [ -z "$SRCFW" ] || [ -z "$OUTFW" ]
then
	echo "usage: $0 srcfw.bin [outfw.bin]"
	exit 1
fi


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


# update version
if [ ! -z "$VERSION" ]
then
	echo "$VERSION" > squashfs-root/etc/bewan/release
fi


# build fs
FS=`dirname $OUTFILE`/`basename -s .bin $OUTFILE`.fs
./fsbuild.sh $FS
RET=$?
if [ $RET != 0 ]
then
	echo "$OLDVERSION" > squashfs-root/etc/bewan/release
	echo "ERROR: fs build failed"
	exit 1
fi

# restore old version
echo "$OLDVERSION" > squashfs-root/etc/bewan/release

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

