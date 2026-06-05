


## Hur publicerar man på git hub pages

den gren du är på när du kör kommandot:

    git subtree push --prefix frontend origin gh-pages 

kommer publicera det som finns i /frontend (den gren man har utcheckad)




## Kolla profile_uuid i databasen på klienten
Kör i konsolen:
    (async () => {
    const all = await cvDb.kandidater.list();
    for (const k of all) {
        const updated = { ...k, profile_uuid: null };
        await cvDb.kandidater.update(k.id, { profile_uuid: null });
        if (k.profile_uuid) await cvDb.settings.set(`pub_at_${k.profile_uuid}`, null);
        console.log(`Kandidat ${k.id} (${k.public_name}): profile_uuid var`, k.profile_uuid);
    }
    const check = await cvDb.kandidater.list();
    console.log('Efter:', check.map(k => ({ id: k.id, uuid: k.profile_uuid })));
    })();

