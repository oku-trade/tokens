.PHONY: setup lint validate

setup:
	sudo apt-get update && sudo apt-get install -y nodejs
	corepack enable
	yarn install

lint:
	yarn format

validate:
	yarn validate

checksum:
	yarn checksum

list:
	yarn list
