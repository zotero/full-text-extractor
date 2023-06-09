#!/bin/bash -e
dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

set -a
. "./global.env"
. "./config.env"
set +a

rm -rf package
mkdir package

docker_tag=$RANDOM

docker build -t full-text-extractor $dir
docker image tag full-text-extractor $docker_registry/full-text-extractor:$docker_tag
docker push $docker_registry/full-text-extractor:$docker_tag

export docker_tag=$docker_tag && j2 template.yaml.j2 > package/package.yaml

aws cloudformation deploy --template-file "$dir/package/package.yaml" --stack-name $stack_name --capabilities CAPABILITY_IAM
aws cloudformation describe-stacks --stack-name $stack_name
rm -rf "$dir/package"