#!/bin/bash

PERMSFILE=perms

if [ ! -f "$PERMSFILE" ]
then
	echo "ERROR: $PERMSFILE doesn't exist"
	exit 1
fi

echo 'restoring perms ...'

DID=0
ERR=0
while read -r LINE
do
	TYPE=`echo "$LINE" | sed -nr 's/^([d-])[r-][w-][x-][r-][w-][x-][r-][w-][x-] .+$/\1/p'`
	PERM=`echo "$LINE" | sed -nr 's/^[d-]([r-][w-][x-])([r-][w-][x-])([r-][w-][x-]) .+$/u=\1,g=\2,o=\3/p' | tr -d '-'`
	NAME=`echo "$LINE" | sed -nr 's/^[d-][r-][w-][x-][r-][w-][x-][r-][w-][x-] ([^/].+)$/\1/p'`

	if [ ! -z "$TYPE" ] && [ ! -z "$PERM" ] && [ ! -z "$NAME" ]
	then
		chmod $PERM $NAME
		RES=$?

		if [ $RES == 0 ]
		then
			DID=1
		else
			ERR=1
		fi
	fi
done < $PERMSFILE

if [ $DID == 0 ] || [ $ERR != 0 ]
then
	echo "ERROR: restore perms failed"
	exit 1
fi

echo 'done.'
exit 0

