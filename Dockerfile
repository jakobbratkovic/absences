FROM node
WORKDIR /app
RUN apt-get update && apt-get -y install cron
COPY *.json /app/
RUN ["npm", "install"]
RUN ["npx", "playwright", "install-deps"]
RUN ["npx", "playwright", "install"]
COPY ["crontab", "/app/crontab"]
RUN ["crontab", "/app/crontab"]
COPY ["src", "/app/src"]
CMD touch /var/log/cron.log && cron && tail -f /var/log/cron.log
