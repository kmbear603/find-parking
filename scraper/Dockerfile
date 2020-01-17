FROM python:3
ADD scraper/main.py /
RUN pip install pytz
RUN pip install mailer
RUN pip install pyquery
RUN pip install requests
CMD [ "python", "./Main.py" ]