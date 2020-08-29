---
title: c++11特性简介 
date: '2020-08-28'
categories:
  - Summary
tags:
  - c++
---

C++自1985年发行以来成为了世界上最成功的的编程语言之一。本文总结了C++11引入的部分重要特性，并逐一举例说明。完整特性与编译器支持请参考[这里$^{[1]}$](https://en.cppreference.com/w/cpp/compiler_support)。

# 部分特性与示例

## 1. 右值引用(rvalue references)

在C语言中，左值与右值原是即为简单的概念。凡是既可以出现在赋值语句两边的称为左值，只能出现在赋值语句右边的称为右值。例如下面的代码中，`a`和`b`是左值，`42`和`a + b`是右值。如果右值出现在赋值语句左边，则会产生一个编译错误。

```cpp
int a = 42;
int b = a;
42 = a + b; //compile error
a + b = a;  //compile error
```
另一种说法是，左值是哪些能被`&`操作符取到地址的值，右值是通过左值运算得出的临时结果或一些字面常量。把上面的代码编译成汇编语言就一目了然了，下面的代码中左值`a`和`b`都在栈上分配了空间，分别是`-4(%rbp)`和`-8(%rbp)`，而右值`42`只是一个立即数，`a + b`则是`addl`的两个参数。

```asm
movl  $42, -4(%rbp)   ;int a = 42;
movl  -4(%rbp), %eax  
movl  %eax, -8(%rbp)
movl  -8(%rbp), %eax  ;int b = a
addl  %eax, -4(rbp);  ;a = a + b
```

使用引用是提高程序运行效率的常用手段，而在只提供左值引用的C++03时代，在某些场景下的引用并没有那么“好用”。下面的代码中，由于无法传递右值`Data()`的引用，我们不得不使用3行丑陋的代码来完成一个简单的工作。

```cpp
extern Data Merge(Data& data1, Data& data2);
//compile error
Data double_data = Merge(Data(), Data()); 
//ok, but ugly
Data data1;
Data data2;
Data double_data = Merge(data1, data2);
```

C++中，提供了右值引用操作符`&&`，于是我们增加支持右值引用的`Merge`，代码可以简化成，

```cpp
extern Data Merge(Data& data1, Data& data2);
extern Data Merge(Data&& data1, Data&& data2);
Data double_data = Merge(Data(), Data()); //ok
```

然而，如果这时候我们想传入一个左值和一个右值，编译器就无法匹配对应的`Merge`了。此时需要使用`std::move`将左值`data1`转化为右值引用，

```cpp
extern Data Merge(Data& data1, Data& data2);
extern Data Merge(Data&& data1, Data&& data2);
Data data1;
Data double_data = Merge(data1, Data()); //compile error
Data double_data = Merge(std::move(data1), Data()); //ok
```

在C++03时代，我们可以通过`const`左值引用扩展右值的生命周期到引用销毁时刻，但其值**不可被修改**。通过右值引用，**不仅可以延长右值的生命周期，其值也可以自由修改**。

```cpp
const int& a = 42;
a = 43; //compile error
int&&b = 42;
b = 43; //ok
```

## 2. 移动语义(move semantic)

移动语义旨在通过右值引用，实现资源的“移动"，而非先拷贝再删除，节省拷贝开销。这里注意，原资源的释放是被要求，但不是必须的。

```cpp
Data(Data&& other) {
  _res = other._res;
  other._res = nullptr;
}
```

### std::move

使用`std::move`可以将左值转为右值，从而方便使用移动语义。**这里指的注意的是，将左值传入移动构造函数，会导致其值被释放。所以应当确保在调用移动构造后，改左值不被使用。**

```cpp
extern Data::Data(const Data& other);
extern Data::Data(Data&& other);
Data d1;
Data d2(d1); //d1 is lvalue, copy constructor
Data d2(std::move(d1)); //std::move(d1) is rvalue, move constructor
```

另外一个值得注意的问题是，有些时候我们以为是一个移动构造，但其实执行的是拷贝构造，例如下面的`_str`其实执行的是`string`的拷贝构造，这是因为**右值引用是一个左值**，正确的做法是`_str = std::move(other._str)`。

```cpp
Data(Data&& other) {
  _str = other._str;
}
```

## 3. 完美转发(perfect forwarding)

完美转发为可变参数模板函数提供了保持原有值语义的转发行为。

```cpp
//模板参数的转发, OuterFunction接受左值引用
template<typename T>
void OuterFunction(T& param) { 
  InnerFunction(param); 
}
OuterFunction(5); //编译错误，不能传递右值
```

为此，我们需要写一个支持右值引用的函数，
```cpp
//模板参数的转发, OuterFunction接受左值引用
template<typename T>
void OuterFunction(T&& param) { 
  InnerFunction(param); 
}
OuterFunction(5); //OK
```
## 4. 智能指针

C++11增加了三种智能指针，
+ `unique_ptr`；独占资源
+ `shared_ptr`：共享资源，引用计数自动销毁
+ `weak_ptr`：解决`shared_ptr`互相引用问题，不占用引用计数

```cpp
unique_ptr<string> pu1(new string ("Hello"));
unique_ptr<string> pu2 = pu1; //ERROR

shared_ptr<string> ps1(new string ("Hello")); //ps1.use_count() = 1
ps2 = ps1;  //ps1.use_count() = 2
```

## 5. lambda表达式(lambda expressions)

```cpp
struct Point {
  int x;
  int y;
};
vector<Point> v;
//c++98
int compByX(const Point& p1, const Point& p1) { return p1.x < p2.x; } 
int compByY(const Point& p1, const Point& p1) { return p1.y < p2.y; } 
sort(v.begin, v.end(), compByX);
sort(v.begin, v.end(), compByY);
//c++11
sort(v.begin, v.end(), [](const Point& p1, const Point& p1) { return p1.x < p2.x });
sort(v.begin, v.end(), [](const Point& p1, const Point& p1) { return p1.y < p2.y });
```

## 6. auto类型变量(auto-typed variables)

```cpp
//c++98
std::vector<int> v;
for (std::vector<int>::iterator it = v.begin(); it != v.end(); ++ it) {
  std::cout << *it << endl;
}
//c++11
for (auto it = v.begin(); it != v.end(); ++ it) {
  std::cout << *it << endl;
}
```
## 7. 基于range的for循环(Range-based for)

```cpp
//c++03
std::vector<int> v;
for (std::vector<int>::iterator it = v.begin(); it != v.end(); ++ it) {
  std::cout << *it << endl;
}
//c++11
for (int& x : v) { std::cout << x << endl; }
//结合auto
for (auto& x : v) { std::cout << x << endl; } //reference
for (auto x : v) { std::cout << x << endl; }  //copy
```

## 8. 初始化列表(Initializer lists)

语法糖，方便对顺序数据结构初始化。

```cpp
//c++03
std::vector<int> v;
v.push_back(1);
v.push_back(2);
v.push_back(3);
//c++11
std::vector<int> v{1,2,3};
std::vector<int> v = {1,2,3};
//自定义初始化列表
#include <initializer_list>
class myVector {
public:
  myVector(const initializer_list<int>& v) {
    for (auto x : v) _v.push_back(x);
  }
private:
  std::vector<int> _v;
};
myVector mv{1,2,3};
myVector mv = {1,2,3};
```

## 9. 静态断言(static_assert)

安全特性，编译器静态检查。

```cpp
static_assert( sizeof(int)==4) );
```

## 10. 委托构造函数(delegating constructor)

语法糖，向java等语言靠近，方便开发。

```cpp
//c++03
class Foo {
public:
  Foo() { init(); }
  Foo(int x) { init(); doSomething(x); }
private:
  void init() { //to some init }
};
//c++11
class Foo {
public:
  Foo() { //to some init }
  Foo(int x) : Foo() { doSomething(x); } //Foo必须首先被调用
};
```

## 11. override关键字

安全特性，显示标识函数的”重载“属性，在编译器检查，防止无效重载。

```cpp
class Base {
  virtual void A(int x);
  virtual void B() const;
};

//c++03
class Derived : public Base {
  virtual void A(float x); //OK, create a new function
  virtual void B();        //OK, create a new function
};
//c++11
class Derived : public Base {
  virtual void A(float x) override; //Error, no funtion to override
  virtual void B() override;        //Error, no funtion to override
};
```

## 12. final关键字

安全特性，防止override

```cpp
struct Base
{
    virtual void foo();
};
 
struct A : Base
{
    void foo() final; // Base::foo is overridden and A::foo is the final override
    void bar() final; // Error: bar cannot be final as it is non-virtual
};
 
struct B final : A // struct B is final
{
    void foo() override; // Error: foo cannot be overridden as it is final in A
};
 
struct C : B // Error: B is final
{
};
```

## 13. delete与default关键字

delete禁用某些成员函数

```cpp
class X {
  X& operator=(const X&) = delete;	// Disallow copying
  X(const X&) = delete;
};
```

default恢复默认无参构造函数
```cpp
class X {
  X() = default;
  X(const X&) {...};
};
```

## 14. nullptr关键字

安全特性，防止宏定义`NULL`的二义性

```cpp
void foo(int i);
void foo(void* p);
//c++98 
foo(NULL); //Error，重载歧义
//c++11
foo(nullptr); //OK, 调用void foo(void* p)
```

# 参考
1. [C++ compiler support, cppreference.com](https://en.cppreference.com/w/cpp/compiler_support)
2. [Value categories, cppreference.com](https://en.cppreference.com/w/cpp/language/value_category)
3. [The Biggest Changes in C++11 (and Why You Should Care)](https://smartbear.com/blog/develop/the-biggest-changes-in-c11-and-why-you-should-care/)
4. [《深入浅出 C++ 11 右值引用》, botmanli(李俊宁), 2020, KM](http://km.oa.com/group/492/articles/show/412065?kmref=search&from_page=1&no=1)
