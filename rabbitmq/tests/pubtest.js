//use the amqplib
var amqp = require('amqplib/callback_api');

//connect to the MQ cluster

amqp.connect('amqp://test:test@127.0.0.1', function (error0, connection) {

    //if connection failed throw error
    if (error0) {
        throw error0;
    }

    //create a channel if connected and send hello world to the logs Q
    connection.createChannel(function (error1, channel) {
        if (error1) {
            throw error1;
        }
        var exchange = 'logs';
        var msg = 'Hello World!';

        channel.assertExchange(exchange, 'fanout', {
            durable: false
        });

        channel.publish(exchange, '', Buffer.from(msg));
        console.log(" [x] Sent %s", msg);
    });


    //in 1/2 a second force close the connection
    setTimeout(function () {
        connection.close();
    }, 500);
});

