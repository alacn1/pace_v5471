#!/bin/bash

PERMSFILE=perms

echo "saving $PERMSFILE ..."

if [ -e "$PERMSFILE" ]
then
	echo "WARNING: overwriting file: $PERMSFILE"
fi

set -o pipefail

# exclude /dev
# exclude .gitkeep
# perm modes
find squashfs-root                    \
  -path squashfs-root/dev -prune      \
  -o                                  \
    ! -name .gitkeep                  \
    -exec stat -c '%A %n' {} \; | sort -t ' ' -k 2 > $PERMSFILE
RET=$?

if [ $RET != 0 ]
then
	echo "ERROR: save perms failed"
	exit 1
fi

echo 'done.'
exit 0

