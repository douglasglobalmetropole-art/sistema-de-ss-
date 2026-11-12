// Previa local com dados sinteticos; nao se conecta ao uMov/SISCOM.
const {fixtureApp}=require('../test/fixtures/app');
fixtureApp().then(({app})=>app.listen(3100,'127.0.0.1',()=>console.log('Fixture http://127.0.0.1:3100')));
