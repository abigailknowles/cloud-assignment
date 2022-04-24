# cloud-assignment

Install Docker Desktop and enable WSL Integration
1. To install Docker Desktop click here: https://docs.docker.com/desktop/windows/install/
2. Open the Docker Desktop settings and go to general and enable `Expose daemon on tcp://localhost:2375 without TLS`, this allows container to run axios posts to host.docker.internal, without this setting on windows with wsl linux containers the post requests fail with the `connection refused` error
3. As the containers were run using Docker d\esktop linux containers you should not run these under Windows Containers aa they may not work as expected

How to run the code
1. run npm i
2.
3.

Features
1 - MongoDB
1. Open VS code and clone my project
2. Go to extensions and install the 'MongoDB' package
3. Open up the MongoDB package and add a new connection for: ''
4. In the MongoDB package select 'Create new playground' and insert tests data into my notFLIX_DB
5. Go to extensions and install the 'REST Client' package
6. Navigate to the mongo.http file and select 'send request' on the APIs you want to test

2 - RabbitMQ / Message Queue
3 - Leadership election
4 - Creating/Deleting containers
5 - Auto-Scailing

TODOs
- There is currently a race condition where some containers are created, but not started and because they aren't started, they are not added to the current message queue and therefor not deleted
- There is a bug where containers are starting up and showing a socket error, I predict this is also a race condition where the containers are trying to communicate with mongo before it has started