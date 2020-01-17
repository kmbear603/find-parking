FROM python:3
ADD Main.py /
RUN pip install pytz
RUN pip install mailer
RUN pip install pyquery
RUN pip install requests
CMD [ "python", "./Main.py" ]