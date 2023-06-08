#!/bin/bash -e
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

package_only=0
while getopts "p" flag; do
case "$flag" in
	p) package_only=1;;
esac
done
shift $((OPTIND-1))

# Explicit config file given
if [ -n "$1" ]; then
	dir="$( cd "$( dirname "$1" )" && pwd )"
	cd $dir
	config_file=$1
# Otherwise look for one in the current directory
else
	dir="$PWD"
	if [ -f "$dir/config.env" ]; then
		config_file="$dir/config.env"
	elif [ -f "$dir/lambda_config.env" ]; then
		config_file="$dir/lambda_config.env"
	else
		echo "$dir/config.env not found"
		exit 1
	fi
fi

set -a
. "$script_dir/global.env"
. "$config_file"
set +a

if [ -z "$stack_name" ]; then
	echo 'stack_name not set'
	exit 1
fi

rm -rf package
mkdir package

# If there's a packaging script, use that
if [ -f lambda_package ]; then
	./lambda_package
elif [ -f package-sam ]; then
	./package-sam
# Otherwise just copy all files
else
	rsync -a --exclude package --exclude .git ./ package/
fi

# Process SAM/CloudFormation template file, which might be a jinja template
if [ -f lambda_template.yaml.j2 ]; then
	j2 lambda_template.yaml.j2 > package/template.yaml
elif [ -f template.yaml.j2 ]; then
	touch package/template.yaml
	j2 template.yaml.j2 > package/template.yaml
else
	cp template.yaml package/template.yaml
fi

# Process jinja templates in node-config files
if [ -d package/config ]; then
	for i in package/config/*.j2; do
		[ -e "$i" ] || continue
		j2 $i > ${i%.j2}
		rm $i
	done
fi

if [ $package_only -eq 1 ]; then
	echo "Created package in $script_dir/package"
	exit
fi

echo $deployment_bucket_name

# SAM template
if grep -qE "Transform:" package/template.yaml; then
	sam package --template-file package/template.yaml --s3-bucket $deployment_bucket_name --output-template-file package/package.yaml
# CloudFormation template
else
	mv package/template.yaml package/package.yaml
fi
aws cloudformation deploy --template-file package/package.yaml --stack-name $stack_name --capabilities CAPABILITY_NAMED_IAM
rm -rf package

aws cloudformation describe-stacks --stack-name $stack_name