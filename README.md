# Cloud Assignment

## Prerequisites
### Install Docker Desktop and enable WSL Integration
1. To install Docker Desktop click here: https://docs.docker.com/desktop/windows/install/
2. Open the Docker Desktop settings and go to general and enable `Expose daemon on tcp://localhost:2375 without TLS`, this allows container to run axios posts to host.docker.internal, without this setting on windows with wsl linux containers the post requests fail with the `connection refused` error
3. I ran these containers using Docker Desktop linux containers. You should not run these under Windows Containers as they may not work as expected

### Clone my solution
`Assuming you have already set up a folder to store my repository`
1. Navigate to my repository
2. Copy the project URL - https://github.com/abigailknowles/cloud-assignment.git
3. Open up VS code and select 'clone repository'
4. Enter my repo URL and the project will clone down

## Running the code
`Assuming you have completed the above step of 'clone my solution'`
1. In VS code open the terminal by going to Terminal > New Terminal or select 'ctrl+shift+
2. Navigate to the 'src directory' of my repo by running 'cd nodejs/src'
3. Ensure there are no existing containers (which there shouldn't be) by running 'docker container rm  $(docker container ls -a -q) --force'
4. Run 'npm i', to ensure all required packages are installed
5. Finally, run the command 'docker-compose up --build'

## Testing Features
- `Ensure you have completed the above step of 'running the code' before you come onto these`
- `Ensure you have Docker Desktop open so you can see the status of the containers`

### 1 - MongoDB
1. Open VS code 
2. Go to extensions and install the 'MongoDB' package
3. Open up the MongoDB package and add a new connection for: 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/notFLIX_DB?replicaSet=rs0'
4. In the MongoDB package select 'Create new playground' and insert tests data into my notFLIX_DB 
5. Go to extensions and install the 'REST Client' package
6. Navigate to the mongo.http file in my 'tests' and select 'send request' on the APIs you want to test

### 2 - RabbitMQ / Message Queue
- Once the solution is running
- You can navigate to "RabbitMQ management": `http://192.168.56.158:15672/#/exchanges`
- Login with the username: `user` and password: `bitnami`
- You will then see all three clusters and up and running and sending/recieving messages
- Alternativley, You will see a console.log from each running container saying "PROCESSING MESSAGE: {"id": ${nodeId}, "hostname": "${hostname}", "isAlive": "${isAlive}", "lastSeenAlive": "${seconds}"

### 3 - Leadership election
- Once the solution is running 
- You should see a console.log of "I am the leader: {nodeId}"
- The leader will be the node with the highest id and will change every so often when nodes start dying
- Console logs identifying the leader should happen as long as the solution is running and should be broadcasted by the node that is the leader

### 4 - API Integration - Creating/Deleting containers
- Once the solution is running
- Only the node which is a leader should be able to create/start containers which can be seen in Docker Desktop
- A console log from the leader node should also output saying "Creating / Starting Container: " + details.Hostname"
- But any node should be able to stop and kill containers, which can also be seen in Docker Desktop (I explain the reason for this in the implementation section of the report)
- A console log from a node should also output saying "Stopping / Deleting Container: " + details.Hostname"
- This will happen between the hours of 4 and 6 but will also happen when a container is killed to ensure the containers never stop running
- There is the edge case that you could see error handling when a node is trying to start/stop a container that no longer exists or is already running, this will return a console.log of "already scaled in/out, action not required"

### 5 - Auto-Scailing
- Once the solution is running
- You should see a console.log of "CURRENT HOUR: {currentHour}", this tells you the current time in hours
- The current hour is then used to check if the time is between 4 and 6, if it is you should see in Docker Desktop that containers will start getting stopped and started based on the HA requirments
- This can either be tested during those hours, or to make it easier you can change the hours to something that suits your time of testing, the time configuration is on app.js on lines 311 and 324

## TODOs
Being transparent, this code still has a few intermitent bugs and I would have liked to have refactored/further developed some parts given I had more time. I have added TODO comments to identify the refactorisation changes I would have made and have identified any intermitent bugs below and explained why I believe it's happening

### Bugs
- There is currently a race condition where some containers are created, but not started and because they aren't created at the time of starting, they are not added to the current message queue and therefor not deleted. This is because the async function doesn't wait until create has finished before it runs start.
- There is a bug where containers are starting up and showing a socket error, I predict this is also a race condition where the containers are trying to communicate with mongo before it has started, once the solution has fully loaded this error goes
- There is also an intermitent bug of two nodes sometimes outputting that they are the leader, I believe this is a timing issue and they are checking the list at the same time. This bug resolves itself after a few seconds and then only one leader is identified

## Contact
If you have any questions feel free to contact me at `CMPAKNOW@ljmu.ac.uk`