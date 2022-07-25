import Vue from 'vue';
import Chart from 'chart.js';
import VueChartkick from 'vue-chartkick';
import VueRouter from 'vue-router';
import VueApollo from 'vue-apollo';
import cubejs from '@cubejs-client/core';
import createExampleWrapper from "@cube-dev/example-wrapper";

import App from './App.vue';
import vuetify from './plugins/vuetify';
import Explore from './pages/explore/Explore.vue';
import Dashboard from './pages/dashboard/Dashboard.vue';
import apolloClient from './graphql/client';

const exampleDescription = {
  title: "Vue Dashboard",
  text:`
    <p>This live demo shows a Vue 2 dashboard built with PostgreSQL as a database, Vuetify, a Vue UI Library with material components, Chart.js and vue-chartkick for data visualization, and Cube.</p>
    <p>
      Follow 
      the <a href="https://cube.dev/blog/vue-query-builder-with-cubejs">tutorial</a>
      or explore 
      the <a href="https://github.com/cube-js/cube.js/tree/master/examples/vue-query-builder">source code</a>
      to learn more.
    </p>
  `
};

createExampleWrapper(exampleDescription);

Vue.use(VueApollo);

const apolloProvider = new VueApollo({
  defaultClient: apolloClient
});

const API_URL = 'https://awesome-ecom.gcp-us-central1.cubecloudapp.dev';
const CUBEJS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1OTQ2NjY4OTR9.0fdi5cuDZ2t3OSrPOMoc3B1_pwhnWj4ZmM3FHEX7Aus';
const cubejsApi = cubejs(CUBEJS_TOKEN, {
  apiUrl: `${API_URL}/cubejs-api/v1`,
});

const router = new VueRouter({
  routes: [
    { path: '/', component: Explore, props: { cubejsApi } },
    { path: '/explore', component: Explore, props: { cubejsApi } },
    { path: '/dashboard', component: Dashboard, props: { cubejsApi } },
  ]
})

Vue.config.productionTip = false;

Vue.use(VueChartkick, { adapter: Chart });
Vue.use(VueRouter);

new Vue({
  router,
  vuetify,
  apolloProvider,
  render: (h) => h(App),
}).$mount('#app');
