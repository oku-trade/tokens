.PHONY: setup lint validate

setup:
	sudo apt-get update && sudo apt-get install -y nodejs
	corepack enable
	yarn install

format:
	yarn prettier:write

lint:
	yarn prettier:check

validate:
	yarn validate

checksum:
	yarn checksum

list:
	yarn list
