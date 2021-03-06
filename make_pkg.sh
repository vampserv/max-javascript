#/usr/bin/bash

### INIT ###
SCRIPT_DIR="$( cd "$( dirname "$0" )" && pwd )"

cd $SCRIPT_DIR

if [ -z ${1+x} ] || [ -z ${2+x} ]; then
	echo "Usage: $0 app_name app_version, e.g. $0 magnet-max-sdk 1.0.0"
	exit 1
fi

APP_NAME=$1
APP_VERSION=$2
BUILD_NUMBER=$3

### FETCH DEPENDENCIES ###
npm install

if [ ! -d node_modules ] ; then
	echo "node.js modules not installed correctly! exiting."
	exit 1
fi

### BUILD ###
grunt full

### version update ###
sed -i -- "s/1.0.0-SNAPSHOT/$APP_VERSION/g" target/$APP_NAME.js
sed -i -- "s/1.0.0-SNAPSHOT/$APP_VERSION/g" target/$APP_NAME.min.js
sed -i -- "s/1.0.0-SNAPSHOT/$APP_VERSION/g" target/$APP_NAME-$APP_VERSION.js
sed -i -- "s/1.0.0-SNAPSHOT/$APP_VERSION/g" target/$APP_NAME-$APP_VERSION.min.js

### PACKAGE ###
# collect temp files in target dir  (maven standard)
cd target/

# zip the SDK
zip -r $APP_NAME-$APP_VERSION.zip ./$APP_NAME-$APP_VERSION.js ./$APP_NAME-$APP_VERSION.min.js

# zip the docs
zip -r $APP_NAME-$APP_VERSION-docs.zip ./docs