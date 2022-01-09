GIT := git
HUGO := hugo

git-update:
	find docs/* | grep -v "CNAME" | xargs rm -r; \
  	$(HUGO) -d docs; \
  	$(GIT) add . ; \
  	$(GIT) commit -m "update"; \
  	$(GIT) push origin master; \

run:
	$(HUGO) server -D

run-slient:
	$(HUGO) server -D &>run.log &

new-post:
	mkdir static/image/$(POST_NAME); \
	hugo new post/$(POST_NAME).md; \

