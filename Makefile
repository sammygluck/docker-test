DOCKER_COMPOSE := docker compose -f srcs/docker-compose.yml

all: up

debug:
	$(DOCKER_COMPOSE) up --build

up:
	$(DOCKER_COMPOSE) up -d --build

start:
	$(DOCKER_COMPOSE) start

stop:
	$(DOCKER_COMPOSE) stop

clean:
	$(DOCKER_COMPOSE) down

fclean:
	$(DOCKER_COMPOSE) down --volumes --rmi all

re: clean
	@$(MAKE) all

.PHONY: all up start stop clean fclean re
