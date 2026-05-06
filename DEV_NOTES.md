# Next  - To do

Now it is time for a large extension. To "personalize" the tool. The goal is to store personality chips  (personality-crumbs) mutch like skills and achievments but on a personal level and mor "soft" level. The service will have a section called "Personality" where really soft skills, dreams, personality-crumbs reside. These pieces of personality will be stored, vectorised, embedded (or what ever) so that it would be possible to state things like "You have the qualifications for this job, but your personalities says you would not like the job". Or the other way around.

There will be an extensive set of questions provided by the system. If the user want to, he/she can start a test and the questions will be put forward and the user will answer truthfully. The answers (together with the  questions and their context) should be stored (embedded, vectorized and in plain text (question and answer)) so that som kind of AI LLM can use the personality crumbs to assess the job's relevance for the user.

In psycology the "big five" has become some sort of standard. The personality-crumbs should be possible to use to set scoring according to the big five model. And, ofcourse, also jobs' requirements should be possible to assess towards the big five scorings

The queries to be used are currently in a .md-file but there is a need for administer these questions in a separate user interface. This should be accessable if the user has system role "admin" (or administrator). The admin role exist not yet in the service so it need to be added. When logged in user has role "admin" then there will be a view called "Peronality questions" where questions will be listed and possible to manage (CRUD). Also a possibility to upload an .md-file with questions that will be put into the database.

The candidate user will have a side bar item called "My person". When selected a view is presented with all answered questions listed along with the user's answers. Each answer editable. There is also a progressbar that indicate the user's progress with all the system's (the service's) questions. There is also a button "Question me!" which will start to ask the not yet answered questions and store the question as well as the user's answer (as stated above)

In a later stage one could think that the service ask relevant qustions for a job and stores these job-specific questions and answers in the database (both as Q & A and as vectors and embeddings)

Start with scetching a plan for the implementation. Present the plan.

# NOTERINGAR

### 1 ONELINER to start DATABASE (Docker, port 5433)
cd /Users/hencar/Utveckling/my/cv-optimizer && docker compose up -d

### 2 VERIFY DATABASE IS UP
docker compose ps postgres

### 3 ONELINER to (re-)start BACKEND
kill $(lsof -ti:8018) 2>/dev/null; sleep 1; cd /Users/hencar/Utveckling/my/cv-optimizer/backend && ../venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8018 &


### 4 VERIFY BACKEND IS UP
sleep 4 && curl -s http://localhost:8018/docs | head -5


### 5 ONELINER to start FRONTEND
kill $(lsof -ti:5501) 2>/dev/null; sleep 1; cd /Users/hencar/Utveckling/my/cv-optimizer/frontend && python serve.py &


ONLINER to RESTART BACKEND
kill $(lsof -ti:8018) 2>/dev/null; sleep 1; cd /Users/hencar/Utveckling/my/cv-optimizer/backend && ../venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8018 &

ONELINER to RESTART FRONTEND



VISA LOGGEN FRÅN DOCKER
docker compose logs --tail=50 2>/dev/null || true


