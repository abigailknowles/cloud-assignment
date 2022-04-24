# cloud-assignment

// TO FILL IN 

Installation of Docker Desktop and WSL Integration


to allow container to run axios posts to host.docker.internal you have to enable `Expose daemon on tcp://localhost:2375 without TLS` within the docker desktop settings under general
without this setting on windows with wsl linux containers the post requests fail with the `connection refused` error

As the containers were run using Docker d\esktop linux containers you should not run these under Windows Containers aa they may not work as expected

