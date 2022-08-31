import express from 'express';
import { logging } from '@api3/operations-utilities/dist/index';
import { serverETHValue, serverBTCValue } from '../setup/deployment';

const PORT = 5000;

const app = express();

app.get('/', (req, res) => {
  console.log(`Got request for ${req.path}`);
  res.send('Mock web API is running!');
});
app.get('/monitor', (req, res) => {
  console.log(`Got request for ${req.path}`);
  res.status(200).send('Monitor is running!');
});
app.get('/explorer', (req, res) => {
  console.log(`Got request for ${req.path}`);
  res.status(200).send('Explorer is running!');
});

app.get('/convert', (req, res) => {
  logging.log('Received request with headers: ' + JSON.stringify(req.headers));
  logging.log('Received request with query: ' + JSON.stringify(req.query));
  logging.log('Received request with body: ' + JSON.stringify(req.body));
  const { from, to, _access_key } = req.query;

  if (from === 'ETH' && to === 'USD') {
    res.status(200).send({ success: true, result: `${serverETHValue}` });
    return;
  }

  if (from === 'BTC' && to === 'USD') {
    res.status(200).send({ success: true, result: `${serverBTCValue}` });
    return;
  }

  res.status(404).send({ success: false, error: 'Unknown price pair' });
});

app.listen(PORT, () => {
  logging.log(`Server is running at http://localhost:${PORT}`);
});
