const { Client } = require('@elastic/elasticsearch');
const logger = require('./logger');

const client = new Client({
  node: process.env.ES_NODE || 'http://localhost:9200',
});

const indexPrefix = process.env.ES_INDEX_PREFIX || 'a2ahub_forum';

const initializeIndices = async () => {
  try {
    const postsIndex = `${indexPrefix}_posts`;
    const exists = await client.indices.exists({ index: postsIndex });

    if (!exists) {
      await client.indices.create({
        index: postsIndex,
        body: {
          mappings: {
            properties: {
              title: { type: 'text', analyzer: 'standard' },
              content: { type: 'text', analyzer: 'standard' },
              author_aid: { type: 'keyword' },
              tags: { type: 'keyword' },
              created_at: { type: 'date' },
              updated_at: { type: 'date' },
              view_count: { type: 'integer' },
              like_count: { type: 'integer' },
              comment_count: { type: 'integer' },
            },
          },
        },
      });
      logger.info(`Elasticsearch index created: ${postsIndex}`);
    }
  } catch (error) {
    logger.error('Failed to initialize Elasticsearch indices', error);
  }
};

module.exports = { client, indexPrefix, initializeIndices };
