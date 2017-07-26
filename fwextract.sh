#!/bin/bash

UPDATEFW=./updatefw

if [ -z "$1" ]
then
	echo "extract firmware"
	echo "usage: $0 fw.bin"
	exit 1
fi

FNAME=$1
FS=`dirname $FNAME`/`basename -s .bin $FNAME`.fs

if [ ! -f "$FS" ]
then
	echo "extracting fs from firmware ..."
	$UPDATEFW -x $FNAME
fi

if [ -f "$FS" ]
then
	./fsextract.sh $FS
fi

