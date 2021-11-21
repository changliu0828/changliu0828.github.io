GIT := git

git-update:
	find docs/* | grep -v "CNAME" | xargs rm -r; \
  	hugo -d docs; \
  	$(GIT) add . ; \
  	$(GIT) commit -m "update"; \
  	$(GIT) push origin master; \


