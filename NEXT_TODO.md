# Next  - To do

Vad ligger i tur att göra i projektet

## Funktion - Dashboard - DONE

I vyn "Dashboard" ska kortet med antalet uppladdade CVn tas bort. Istället ska kortet visa antalet tillgängliga CV (som är nedladdningsbara i original), och nya kort tillkommer för Utbildning och Kurser & Cert så att antalet av kompetenser, erfarenheter, utbildningar, kurser & cert är aktuellt

Nya kort för genvägar till ändra profilen, ändra erfarenheter, ladda upp cv, Sök jobb


## Dashboard - items and system roles
Regarding the stat-cards - 
The stat-cards ot type class="stat-card" having the following ids:
* id="dash-cv-count"
* id="dash-skills-count"
* id="dash-exp-count"
* id="dash-edu-count"
* id="dash-cert-count"
requires that the logged in user has the system role "Candidate" to be shown/accessable/visible

Regarding the cards of type class="action-card action-card--primary" -
All of the existing action-cards requires that the logged in user has the system role "Candidate" to be shown/accessable/visible

I suggest that all visual items that requires a specific system role should have a css-class indicating so. then hiding showing elements that depend on system role are easily made visible or not. Another option is to put the logic in the code and not even render objects that should not be there. Implement best practice as mor and more items will be related to system roles as we continue implementing this app

OR-logic
data-requires-role="<RoleNameA> <RoleNameB> <RoleNameC>" 

AND-logic
data-requires-all-roles="<RoleNameA> <RoleNameB>"

<div class="stat-card hidden" data-requires-role="Kandidat">...</div>


# NOTERINGAR

ONELINER to start BACKEND
kill $(lsof -ti:5432) 2>/dev/null; 
kill $(lsof -ti:5433) 2>/dev/null; 
kill $(lsof -ti:8000) 2>/dev/null; 
kill $(lsof -ti:8001) 2>/dev/null; sleep 1; cd /Users/hencar/Utveckling/my/cv-optimizer/backend && ../venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001 &

VERIFY BACKEND IS UP
sleep 4 && curl -s http://localhost:8001/docs | head -5

ONELINER to start FRONTEND
cd /Users/hencar/Utveckling/my/cv-optimizer/frontend && python -m http.server 5501
cd /Users/hencar/Utveckling/my/cv-optimizer/frontend && python serve.py

VISA LOGGEN FRPN DOCKER
docker compose logs --tail=50 2>/dev/null || true


