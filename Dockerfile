FROM ubuntu:14.04

MAINTAINER Daniel Kokott <dako@berlingskemedia.dk>

# Installing wget - needed to download node.js
RUN apt-get update
RUN apt-get install -y wget

# Downloading and installing Node.
RUN wget -O - http://nodejs.org/dist/v0.12.5/node-v0.12.5-linux-x64.tar.gz \
    | tar xzf - --strip-components=1 --exclude="README.md" --exclude="LICENSE" \
    --exclude="ChangeLog" -C "/usr/local"

# Set the working directory.
WORKDIR /nyhedsbrevekompilator

# Copying the code into image. Be aware no config files are including.
COPY ./admin /nyhedsbrevekompilator/admin
COPY ./node_modules /nyhedsbrevekompilator/node_modules
COPY ./src /nyhedsbrevekompilator/src
COPY ./templates /nyhedsbrevekompilator/templates
COPY ./testdata /nyhedsbrevekompilator/testdata

# Exposing our endpoint to Docker.
EXPOSE  8000

# When starting a container with our image, this command will be run.
CMD ["node", "src/server.js"]