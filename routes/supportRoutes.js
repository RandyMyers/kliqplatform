const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const forumController = require('../controllers/forumController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/tickets', supportController.list);
router.post('/tickets', supportController.create);
router.get('/tickets/:id', supportController.getById);
router.put('/tickets/:id', supportController.update);
router.post('/tickets/:id/replies', supportController.addReply);

router.get('/articles', supportController.listArticles);
router.get('/articles/:id', supportController.getArticleById);

router.get('/forum/categories', forumController.listCategories);
router.get('/forum/posts', forumController.listPosts);
router.get('/forum/posts/:id', forumController.getPostById);
router.post('/forum/posts', forumController.createPost);
router.post('/forum/posts/:id/replies', forumController.createReply);

module.exports = router;
