const mongoose = require('mongoose');
var amqp = require('amqplib/callback_api');
const express = require('express')
const axios = require('axios');
const bodyParser = require('body-parser');

/** 
 * Global variables
 */
const app = express()
const port = 3000
//connection string listing the mongo servers. This is an alternative to using a load balancer. THIS SHOULD BE DISCUSSED IN YOUR ASSIGNMENT.
const connectionString = 'mongodb://localmongo1:27017,localmongo2:27017,localmongo3:27017/notFLIX_DB?replicaSet=rs0';
const os = require('os');

var exchange = 'nodes';
var hostname = os.hostname;

var isAlive = false;
var isLeader = false;
var messageQueueStarted = false;

//generate node id and find current time in seconds
var nodeId = Math.floor(Math.random() * (100 - 1 + 1) + 1);
var seconds = getTimeInSeconds();
var nodes = { id: nodeId, hostname: hostname, isAlive: isAlive, lastSeenAlive: seconds };
var messageList = [];
var deadLetterQueue = [];
messageList.push(nodes);

/**
 * 
 * This is just the fucntion set up section
 * 
 */

function createChannelAndPublishMessage(connection) {
  //create a channel if connected and send hello world to the logs Q
  connection.createChannel(function (error1, channel) {
    if (error1) {
      throw error1;
    }

    isAlive = true;

    var msg = `{"id": ${nodeId}, "hostname": "${hostname}", "isAlive": "${isAlive}", "lastSeenAlive": "${getTimeInSeconds()}" }`;

    channel.assertExchange(exchange, 'fanout', {
      durable: false
    });

    channel.publish(exchange, '', Buffer.from(msg));

  });
}

function processMessage(message) {
  if (message.content) {
    //console.log("Received [x] %s", msg.content.toString());
    messageQueueStarted = true;

    var content = JSON.parse(message.content.toString());
    var newTime = getTimeInSeconds();

    if (messageList.some(message => message.hostname === content.hostname) === false) {
      messageList.push(content);
    }
    //might need to do something else here 
  }
}

function createChannelAndConsumeMessages(connection) {
  connection.createChannel(function (error1, channel) {
    if (error1) {
      throw error1;
    }

    channel.assertExchange(exchange, 'fanout', {
      durable: false
    });

    channel.assertQueue('', { exclusive: true }, function (error2, q) {
      if (error2) {
        throw error2;
      }
      console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", q.queue);
      channel.bindQueue(q.queue, exchange, '');

      channel.consume(q.queue, function (message) {

        processMessage(message);

      }, {
        noAck: true
      });
    });
  });
}

function getHighestMessageId() {
  var currentHighestNodeId = 0;
  messageList.forEach(message => {
    //for consistency across all nodes we need to find the current highest node id value

    //if the message I'm looking at isn't mine, and the message id we are looking at is higher than the last message id we looked at
    //set the last message id to be the current message id value
    if (message.hostname !== hostname && message.id > currentHighestNodeId) {
      currentHighestNodeId = message.id;
    }
  });
}

function selectNewLeader() {
  if (messageQueueStarted) {
    // get the highest message id in the list
    var highestMessageId = getHighestMessageId();

    //if my id is the highest id then I am the new leader
    if (nodeId >= highestMessageId)
      isLeader = true;

    // but what if I'm not??
  }
}

function createDeadLettersForProcessing() {
  Object.entries(messageList).forEach(([index, message]) => {
    console.log("last seen time: ", Math.round(seconds - message.lastSeenAlive))
    if (Math.round(seconds - message.lastSeenAlive) > 10) {
      message.isAlive = false;
      console.log(`Node with ID: ${message.id} not seen for longer than 10 seconds`);
      deadLetterQueue.push(message);
    }
  });
}

function processDeadLetterQueue() {
  deadLetterQueue.forEach(message => {
    if (isLeader) {
      createContainer();
    }
    console.log(`killing host: ${message.hostname}`);
    killContainer(message.hostname);
  });

  deadLetterQueue = [];
}

function getTimeInSeconds() {
  return Math.round(new Date().getTime() / 1000, 2);
}

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
}

function getContainerConfig(id) {
  return {
    Image: "cloud-assignment_node1",
    Hostname: `node_${id}`,
    NetworkConfig: {
      EndpointsConfig: {
        "cloud-assignment_nodejs": {},
      },
    },
  };
}

function startContainer(id) {
  await axios.post(`http://host.docker.internal:2375/containers/node_${id}/start`).then((response) => {
    console.log("container start succeeded");
  }, (error) => {
    console.log("Exception starting container");
    console.log(error.response.data);
  });
}

async function createContainer() {
  var id = getRandomIntInclusive(100, 999);

  var config = getContainerConfig(id)

  await axios.post(`http://host.docker.internal:2375/containers/create?name=node_${id}`, config).then((response) => {
    startContainer(id);
  }, (error) => {
    console.log("Exception creating container");
    console.log(error.response.data);
  });
}

async function killContainer(id) {
  await axios.post(`http://host.docker.internal:2375/containers/${id}/kill`).then((response) => {
    deleteContainer(id);
  }, (error) => {
    console.log("Exception killing container");
    console.log(error.response.data);
  });
}

function deleteContainer(id) {
  await axios.delete(`http://host.docker.internal:2375/containers/${id}`).then((response) => {
    console.log("deletion success");
  }, (error) => {
    console.log("Exception deleting container");
    console.log(error.response.data);
  });
}

/**
 * 
 * This is the pub / sub section
 * 
 */
//publisher
setInterval(function () {
  // connect to haproxy
  amqp.connect('amqp://user:bitnami@cloud-assignment_haproxy_1', function (error0, connection) {
    if (error0) {
      throw error0;
    }

    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      isAlive = true;

      var msg = `{"id": ${nodeId}, "hostname": "${hostname}", "isAlive": "${isAlive}", "lastSeenAlive": "${getTimeInSeconds()}" }`;

      channel.assertExchange(exchange, 'fanout', {
        durable: false
      });

      channel.publish(exchange, '', Buffer.from(msg));

    });

    //in 1/2 a second force close the connection
    setTimeout(function () {
      connection.close();
    }, 500);
  }, 3000);
});


// Subscriber
amqp.connect('amqp://user:bitnami@cloud-assignment_haproxy_1', function (error0, connection) {
  if (error0) {
    throw error0;
  }

  connection.createChannel(function (error1, channel) {
    if (error1) {
      throw error1;
    }

    channel.assertExchange(exchange, 'fanout', {
      durable: false
    });

    channel.assertQueue('', { exclusive: true }, function (error2, q) {
      if (error2) {
        throw error2;
      }
      console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", q.queue);
      channel.bindQueue(q.queue, exchange, '');

      channel.consume(q.queue, function (message) {

        processMessage(message);

      }, {
        noAck: true
      });
    });
  });

});

// every 3 seconds check if a new leader is required and select one based on the highest id value
setInterval(function () {
  selectNewLeader();
}, 3000);


setInterval(function () {
  console.log("checking for and processing dead letters");
  createDeadLettersForProcessing();

  processDeadLetterQueue();
}, 5000);

/**
 * 
 * mongoose stuff
 * 
 */
//bind the express web service to the port specified
app.listen(port, () => {
  console.log(`Express Application listening at port ` + port)
})

//tell express to use the body parser. Note - This function was built into express but then moved to a seperate package.
app.use(bodyParser.json());

//connect to the cluster
mongoose.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true });


var db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

var Schema = mongoose.Schema;

//setting up the database
var analyticsSchema = new Schema({
  _id: Number,
  accountId: Number,
  username: String,
  titleId: Number,
  userAction: String,
  dateAndTime: String,
  pointOfInteraction: String,
  typeOfInteraction: String
});

var analyticsModel = mongoose.model('Analytics', analyticsSchema, 'analytics');


app.get('/', (req, res) => {
  analyticsModel.find({}, 'username title_id user_action', (err, analytics) => {
    if (err) return handleError(err);
    res.send(JSON.stringify(analytics))
  })
})

app.post('/', (req, res) => {
  var new_analytics_instance = new analyticsModel(req.body);
  new_analytics_instance.save(function (err) {
    if (err) res.send('Error');
    res.send(JSON.stringify(req.body))
  });
})

app.put('/', (req, res) => {
  res.send('Got a PUT request at /')
})

app.delete('/', (req, res) => {
  res.send('Got a DELETE request at /')
})


